import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Bell, BellOff, LayoutGrid, List, Printer } from 'lucide-react';
import TimetableGrid from './components/TimetableGrid';
import Modal from './components/Modal';
import { DAYS, generateHours, getRandomColor } from './utils/constants';
import { supabase } from './lib/supabase';

// Helper to play a synthetic pleasant chime sound natively using AudioContext
const playChime = () => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
  osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1); // A5
  
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 1.5);
};

// Map JS day integers to our DAYS array
const JS_DAY_MAP = [6, 0, 1, 2, 3, 4, 5]; // Sunday is 0 in JS Date().getDay(), we want Monday=0

// Helper to get array of formatted dates for the current week (Mon-Sun)
const getWeekDates = (offsetWeeks) => {
  const now = new Date();
  const currentDayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - currentDayOfWeek + (offsetWeeks * 7));
  return DAYS.map((_, index) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + index);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
};

// Map Supabase snake_case row → camelCase JS object
const rowToSlot = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description || '',
  day: row.day,
  startHour: row.start_hour,
  endHour: row.end_hour,
  color: row.color,
  weekOffset: row.week_offset,
});

// Map camelCase JS object → Supabase snake_case row
const slotToRow = (slot) => ({
  title: slot.title,
  description: slot.description || '',
  day: slot.day,
  start_hour: slot.startHour,
  end_hour: slot.endHour,
  color: slot.color,
  week_offset: slot.weekOffset,
});

function App() {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null);
  const [initialSlotData, setInitialSlotData] = useState(null);
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const [showCollapsed, setShowCollapsed] = useState(false);

  const activeHours = useMemo(() => generateHours(intervalMinutes), [intervalMinutes]);
  const weekDates = useMemo(() => getWeekDates(currentWeekOffset), [currentWeekOffset]);

  // Derived state: only show slots for the active week
  const activeSlots = useMemo(() => {
    return slots.filter((s) => s.weekOffset === currentWeekOffset);
  }, [slots, currentWeekOffset]);

  // ─── Supabase: Load all slots on mount ───────────────────────────────────────
  useEffect(() => {
    const fetchSlots = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('timetable_slots')
        .select('*')
        .order('start_hour', { ascending: true });

      if (error) {
        console.error('Error fetching slots:', error);
        setDbError(error.message);
      } else {
        setSlots(data.map(rowToSlot));
      }
      setLoading(false);
    };

    fetchSlots();
  }, []);

  // ─── Notifications ────────────────────────────────────────────────────────────
  useEffect(() => {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        const saved = localStorage.getItem('timetable_notifications');
        if (saved !== 'disabled') setNotificationsEnabled(true);
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') setNotificationsEnabled(true);
        });
      }
    }
  }, []);

  const toggleNotifications = () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      localStorage.setItem('timetable_notifications', 'disabled');
    } else {
      if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            setNotificationsEnabled(true);
            localStorage.setItem('timetable_notifications', 'enabled');
          }
        });
      } else {
        setNotificationsEnabled(true);
        localStorage.setItem('timetable_notifications', 'enabled');
      }
    }
  };

  useEffect(() => {
    const checkNotifications = () => {
      if (!notificationsEnabled) return;
      const now = new Date();
      const currentDecimalHour = now.getHours() + (now.getMinutes() / 60);
      const currentDayString = DAYS[JS_DAY_MAP[now.getDay()]];
      slots.forEach(slot => {
        if (slot.day !== currentDayString) return;
        const diffMinutes = Math.round((slot.startHour - currentDecimalHour) * 60);
        if (diffMinutes === 5 || diffMinutes === 0) {
          playChime();
          new Notification(slot.title, {
            body: diffMinutes === 0 ? 'Event is starting now!' : 'Event starting in 5 minutes.',
            icon: '/react.svg',
          });
        }
      });
    };
    checkNotifications();
    const intervalId = setInterval(checkNotifications, 60000);
    return () => clearInterval(intervalId);
  }, [slots, notificationsEnabled]);

  // ─── CRUD Handlers (all async, Supabase-backed) ───────────────────────────────

  const handleSlotSave = useCallback(async (slotData) => {
    if (editingSlot) {
      // Optimistic update
      setSlots(prev => prev.map(s => s.id === slotData.id ? slotData : s));
      setIsModalOpen(false);
      setEditingSlot(null);
      setInitialSlotData(null);

      const { error } = await supabase
        .from('timetable_slots')
        .update(slotToRow(slotData))
        .eq('id', slotData.id);

      if (error) {
        console.error('Update failed:', error);
        setDbError('Failed to save changes. Please try again.');
      }
    } else {
      // Build new slot with a temp id for optimistic insert
      const tempId = crypto.randomUUID();
      const newSlot = { ...slotData, id: tempId, weekOffset: currentWeekOffset };

      setSlots(prev => [...prev, newSlot]);
      setIsModalOpen(false);
      setInitialSlotData(null);

      const { data, error } = await supabase
        .from('timetable_slots')
        .insert(slotToRow(newSlot))
        .select()
        .single();

      if (error) {
        console.error('Insert failed:', error);
        setDbError('Failed to add event. Please try again.');
        // Roll back optimistic insert
        setSlots(prev => prev.filter(s => s.id !== tempId));
      } else {
        // Replace temp ID with real DB-assigned UUID
        setSlots(prev => prev.map(s => s.id === tempId ? rowToSlot(data) : s));
      }
    }
  }, [editingSlot, currentWeekOffset]);

  const handleDelete = useCallback(async (id) => {
    // Optimistic delete
    setSlots(prev => prev.filter(s => s.id !== id));
    setIsModalOpen(false);
    setEditingSlot(null);

    const { error } = await supabase
      .from('timetable_slots')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete failed:', error);
      setDbError('Failed to delete event. Please try again.');
    }
  }, []);

  const handleDuplicate = useCallback(async (slotData) => {
    const duration = slotData.endHour - slotData.startHour;
    const maxHour = Math.max(...activeHours);
    let newStartHour = slotData.startHour + duration;
    let newEndHour = slotData.endHour + duration;
    if (newEndHour > maxHour) {
      newStartHour = slotData.startHour;
      newEndHour = slotData.endHour;
    }

    const tempId = crypto.randomUUID();
    const duplicated = { ...slotData, id: tempId, startHour: newStartHour, endHour: newEndHour };

    setSlots(prev => [...prev, duplicated]);
    setIsModalOpen(false);

    const { data, error } = await supabase
      .from('timetable_slots')
      .insert(slotToRow(duplicated))
      .select()
      .single();

    if (error) {
      console.error('Duplicate failed:', error);
      setSlots(prev => prev.filter(s => s.id !== tempId));
    } else {
      setSlots(prev => prev.map(s => s.id === tempId ? rowToSlot(data) : s));
    }
  }, [activeHours]);

  // Drag-and-drop updates the DB too
  const handleSetSlots = useCallback(async (updaterFn) => {
    setSlots(prev => {
      const next = typeof updaterFn === 'function' ? updaterFn(prev) : updaterFn;
      // Find moved slot (the one whose day or hour changed)
      const moved = next.find((ns, i) => {
        const os = prev[i];
        return os && (ns.day !== os.day || ns.startHour !== os.startHour || ns.endHour !== os.endHour);
      });
      if (moved) {
        supabase
          .from('timetable_slots')
          .update(slotToRow(moved))
          .eq('id', moved.id)
          .then(({ error }) => {
            if (error) console.error('Drag-save failed:', error);
          });
      }
      return next;
    });
  }, []);

  // ─── Modal Helpers ────────────────────────────────────────────────────────────

  const openAddModal = (day = DAYS[0], startHour = 9) => {
    setEditingSlot(null);
    setInitialSlotData({
      day,
      startHour,
      endHour: startHour + (intervalMinutes === 60 ? 1 : intervalMinutes === 30 ? 0.5 : 0.25),
      title: '',
      description: '',
      color: getRandomColor(),
      weekOffset: currentWeekOffset,
    });
    setIsModalOpen(true);
  };

  const getWeekLabel = () => {
    if (currentWeekOffset === 0) return 'This Week';
    if (currentWeekOffset === -1) return 'Last Week';
    if (currentWeekOffset === 1) return 'Next Week';
    return currentWeekOffset < 0 ? `${-currentWeekOffset} Weeks Ago` : `In ${currentWeekOffset} Weeks`;
  };

  const openEditModal = (slot) => {
    setEditingSlot(slot);
    setInitialSlotData(null);
    setIsModalOpen(true);
  };

  const formatAgendaTime = (time) => {
    const fraction = time % 1;
    const hourInt = Math.floor(time);
    let minuteStr = '00';
    if (fraction === 0.25) minuteStr = '15';
    if (fraction === 0.5) minuteStr = '30';
    if (fraction === 0.75) minuteStr = '45';
    return `${hourInt > 12 ? hourInt - 12 : hourInt === 12 ? 12 : hourInt}:${minuteStr} ${hourInt >= 12 && hourInt < 24 ? 'PM' : 'AM'}`;
  };

  const sortedAgendaSlots = useMemo(() => {
    return [...activeSlots].sort((a, b) => {
      const dayDiff = DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
      if (dayDiff !== 0) return dayDiff;
      return a.startHour - b.startHour;
    });
  }, [activeSlots]);

  const scrollToHour = useMemo(() => {
    if (currentWeekOffset !== 0) return 8;
    const todayIndex = JS_DAY_MAP[new Date().getDay()];
    const todayName = DAYS[todayIndex];
    const todaySlots = activeSlots.filter(s => s.day === todayName);
    if (todaySlots.length > 0) return Math.min(...todaySlots.map(s => s.startHour));
    return 8;
  }, [activeSlots, currentWeekOffset]);

  const handlePrint = () => window.print();

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="layout-container" data-view={showCollapsed ? 'agenda' : 'grid'}>
      <header className="app-header glass">
        <div className="header-left">
          <div>
            <h1 className="heading-gradient">Rag's Timetable</h1>
            <p className="subtitle">Drag, drop, and organize your week efficiently.</p>
          </div>
          
          <div className="week-nav glass-panel">
            <button className="icon-btn" onClick={() => setCurrentWeekOffset(prev => prev - 1)} aria-label="Previous Week">
              &larr;
            </button>
            <span className="week-label">{getWeekLabel()}</span>
            <button className="icon-btn" onClick={() => setCurrentWeekOffset(prev => prev + 1)} aria-label="Next Week">
              &rarr;
            </button>
          </div>
        </div>

        <div className="header-actions">
          <button
            className={`icon-btn notif-btn ${notificationsEnabled ? 'active' : ''}`}
            onClick={toggleNotifications}
            aria-label={notificationsEnabled ? 'Disable Notifications' : 'Enable Notifications'}
            title={notificationsEnabled ? 'Notifications On' : 'Notifications Off'}
          >
            {notificationsEnabled ? <Bell size={18} /> : <BellOff size={18} />}
          </button>
          
          <div className="toggle-group glass-panel">
            <button
              className={`toggle-btn ${!showCollapsed ? 'active' : ''}`}
              onClick={() => setShowCollapsed(false)}
              title="Grid View"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              className={`toggle-btn ${showCollapsed ? 'active' : ''}`}
              onClick={() => setShowCollapsed(true)}
              title="Collapsed / Agenda View"
            >
              <List size={16} />
            </button>
          </div>

          {!showCollapsed && (
            <div className="toggle-group glass-panel hide-mobile">
              <button className={`toggle-btn ${intervalMinutes === 60 ? 'active' : ''}`} onClick={() => setIntervalMinutes(60)}>1h</button>
              <button className={`toggle-btn ${intervalMinutes === 30 ? 'active' : ''}`} onClick={() => setIntervalMinutes(30)}>30m</button>
              <button className={`toggle-btn ${intervalMinutes === 15 ? 'active' : ''}`} onClick={() => setIntervalMinutes(15)}>15m</button>
            </div>
          )}
          <button className="primary-btn" onClick={() => openAddModal()}>
            <Plus size={20} />
            <span className="hide-mobile">Add Entry</span>
          </button>
          <button className="icon-btn print-btn" onClick={handlePrint} title="Print / Save as PDF">
            <Printer size={18} />
          </button>
        </div>
      </header>

      {/* Print-only header — hidden on screen */}
      <div className="print-header">
        <h1>Rag's Timetable</h1>
        <p>{getWeekLabel()} &nbsp;·&nbsp; {weekDates[0]} – {weekDates[6]}</p>
      </div>

      {dbError && (
        <div className="db-error-banner">
          ⚠️ {dbError}
          <button onClick={() => setDbError(null)}>✕</button>
        </div>
      )}

      <main className="main-content">
        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Loading your timetable…</p>
          </div>
        ) : showCollapsed ? (
          <div className="agenda-container animate-fade-in">
            {sortedAgendaSlots.length === 0 ? (
              <div className="agenda-empty glass">
                <p>No events scheduled for this week.</p>
                <button className="primary-btn mt-4" onClick={() => openAddModal()}>Schedule Event</button>
              </div>
            ) : (
              <div className="agenda-list">
                {sortedAgendaSlots.map((slot) => (
                  <div
                    key={slot.id}
                    className={`agenda-item glass bg-${slot.color}`}
                    onClick={() => openEditModal(slot)}
                  >
                    <div className="agenda-time">
                      <span className="agenda-day">{slot.day}</span>
                      <span className="agenda-hours">{formatAgendaTime(slot.startHour)} - {formatAgendaTime(slot.endHour)}</span>
                    </div>
                    <div className="agenda-details">
                      <h3 className="agenda-title">{slot.title}</h3>
                      {slot.description && <p className="agenda-desc text-muted">{slot.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <TimetableGrid
            slots={activeSlots}
            weekDates={weekDates}
            setSlots={handleSetSlots}
            onCellClick={(day, hour) => openAddModal(day, hour)}
            onSlotClick={openEditModal}
            activeHours={activeHours}
            intervalMinutes={intervalMinutes}
            scrollToHour={scrollToHour}
            currentWeekOffset={currentWeekOffset}
          />
        )}
      </main>

      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditingSlot(null);
            setInitialSlotData(null);
          }}
          slot={editingSlot || initialSlotData}
          onSave={handleSlotSave}
          onDelete={handleDelete}
          onDuplicate={editingSlot ? handleDuplicate : undefined}
          activeHours={activeHours}
        />
      )}
    </div>
  );
}

export default App;
