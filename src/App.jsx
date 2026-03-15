import { useState, useEffect, useMemo } from 'react';
import { Plus, Bell, BellOff, LayoutGrid, List } from 'lucide-react';
import TimetableGrid from './components/TimetableGrid';
import Modal from './components/Modal';
import { DAYS, generateHours, getRandomColor } from './utils/constants';

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
  const currentDayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // 0 for Monday, 6 for Sunday
  
  // Start date of the current calendar week (Monday)
  const monday = new Date(now);
  monday.setDate(now.getDate() - currentDayOfWeek + (offsetWeeks * 7));

  return DAYS.map((_, index) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + index);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
};

// Helper to load state from localStorage or use default wrapper
const loadInitialSlots = () => {
  try {
    const saved = localStorage.getItem('timetable_slots');
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error('Failed to parse slots from localStorage:', error);
    return [];
  }
};

function App() {
  const [slots, setSlots] = useState(loadInitialSlots);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null);
  const [initialSlotData, setInitialSlotData] = useState(null);
  const [intervalMinutes, setIntervalMinutes] = useState(60); // View mode toggle
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0); // 0 = current week
  const [showCollapsed, setShowCollapsed] = useState(false); // Agenda view

  const activeHours = useMemo(() => generateHours(intervalMinutes), [intervalMinutes]);
  const weekDates = useMemo(() => getWeekDates(currentWeekOffset), [currentWeekOffset]);

  // Derived state: only show slots for the active week
  const activeSlots = useMemo(() => {
    return slots.filter((s) => s.weekOffset === currentWeekOffset);
  }, [slots, currentWeekOffset]);

  // Request notifications
  useEffect(() => {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        // Only set to true if they haven't explicitly disabled it
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

  // Poll for upcoming notifications
  useEffect(() => {
    const checkNotifications = () => {
      if (!notificationsEnabled) return;
      
      const now = new Date();
      // Only process at the start of a minute to avoid spam
      const minutes = now.getMinutes();
      const hours = now.getHours();
      const currentDecimalHour = hours + (minutes / 60);
      
      const currentDayIndex = JS_DAY_MAP[now.getDay()];
      const currentDayString = DAYS[currentDayIndex];

      slots.forEach(slot => {
        if (slot.day !== currentDayString) return;

        // Start time in decimal hours
        const diff = slot.startHour - currentDecimalHour;
        
        // Convert difference to minutes
        const diffMinutes = Math.round(diff * 60);

        // Notify 5 minutes before exactly OR exactly at start
        if (diffMinutes === 5 || diffMinutes === 0) {
           playChime();
           new Notification(slot.title, {
             body: diffMinutes === 0 ? "Event is starting now!" : "Event starting in 5 minutes.",
             icon: '/react.svg', // generic placeholder
           });
        }
      });
    };

    // Check immediately, then every 60s
    checkNotifications();
    const intervalId = setInterval(checkNotifications, 60000);
    return () => clearInterval(intervalId);
  }, [slots, notificationsEnabled]);

  // Persist to localStorage whenever slots change
  useEffect(() => {
    localStorage.setItem('timetable_slots', JSON.stringify(slots));
  }, [slots]);

  // Handlers
  const handleSlotSave = (slotData) => {
    if (editingSlot) {
      setSlots((prev) => prev.map((s) => (s.id === slotData.id ? slotData : s)));
    } else {
      setSlots((prev) => [...prev, { ...slotData, id: crypto.randomUUID(), weekOffset: currentWeekOffset }]);
    }
    setIsModalOpen(false);
    setEditingSlot(null);
    setInitialSlotData(null);
  };

  const handleDelete = (id) => {
    setSlots((prev) => prev.filter((s) => s.id !== id));
    setIsModalOpen(false);
    setEditingSlot(null);
  };

  const handleDuplicate = (slotData) => {
    // Offset by duplicate slot length if possible, or +1 hr default
    const duration = slotData.endHour - slotData.startHour;
    const maxHour = Math.max(...activeHours);
    
    let newStartHour = slotData.startHour + duration;
    let newEndHour = slotData.endHour + duration;
    
    if (newEndHour > maxHour) {
       newStartHour = slotData.startHour;
       newEndHour = slotData.endHour;
    }

    setSlots((prev) => [
      ...prev,
      {
        ...slotData,
        id: crypto.randomUUID(),
        startHour: newStartHour,
        endHour: newEndHour,
      },
    ]);
    setIsModalOpen(false);
  };

  // Default starting hour for Add Modal = 9 AM
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

  // Helper for displaying current week
  const getWeekLabel = () => {
    if (currentWeekOffset === 0) return "This Week";
    if (currentWeekOffset === -1) return "Last Week";
    if (currentWeekOffset === 1) return "Next Week";
    return currentWeekOffset < 0 ? `${-currentWeekOffset} Weeks Ago` : `In ${currentWeekOffset} Weeks`;
  };

  const openEditModal = (slot) => {
    setEditingSlot(slot);
    setInitialSlotData(null);
    setIsModalOpen(true);
  };
  
  // Basic time formatter for Agenda view
  const formatAgendaTime = (time) => {
    const fraction = time % 1;
    const hourInt = Math.floor(time);
    let minuteStr = '00';
    if (fraction === 0.25) minuteStr = '15';
    if (fraction === 0.5) minuteStr = '30';
    if (fraction === 0.75) minuteStr = '45';
    return `${hourInt > 12 ? hourInt - 12 : hourInt === 12 ? 12 : hourInt}:${minuteStr} ${hourInt >= 12 && hourInt < 24 ? 'PM' : 'AM'}`;
  };

  // Sort active slots chronologically for the Agenda view
  const sortedAgendaSlots = useMemo(() => {
    return [...activeSlots].sort((a, b) => {
      const dayDiff = DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
      if (dayDiff !== 0) return dayDiff;
      return a.startHour - b.startHour;
    });
  }, [activeSlots]);

  // Compute auto-scroll hour based on current day
  const scrollToHour = useMemo(() => {
    if (currentWeekOffset !== 0) return 8; // Default to 8 AM for other weeks
    
    const JS_DAY_MAP = [6, 0, 1, 2, 3, 4, 5]; // Sunday is 0 in JS Date().getDay(), we want Monday=0
    const todayIndex = JS_DAY_MAP[new Date().getDay()];
    const todayName = DAYS[todayIndex];

    const todaySlots = activeSlots.filter(s => s.day === todayName);
    if (todaySlots.length > 0) {
      return Math.min(...todaySlots.map(s => s.startHour));
    }
    return 8; // Default to 8 AM if no slots today
  }, [activeSlots, currentWeekOffset]);

  return (
    <div className="layout-container">
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
            aria-label={notificationsEnabled ? "Disable Notifications" : "Enable Notifications"}
            title={notificationsEnabled ? "Notifications On" : "Notifications Off"}
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
              <button 
                className={`toggle-btn ${intervalMinutes === 60 ? 'active' : ''}`}
                onClick={() => setIntervalMinutes(60)}
              >
                1h
              </button>
              <button 
                className={`toggle-btn ${intervalMinutes === 30 ? 'active' : ''}`}
                onClick={() => setIntervalMinutes(30)}
              >
                30m
              </button>
              <button 
                className={`toggle-btn ${intervalMinutes === 15 ? 'active' : ''}`}
                onClick={() => setIntervalMinutes(15)}
              >
                15m
              </button>
            </div>
          )}
          <button className="primary-btn" onClick={() => openAddModal()}>
            <Plus size={20} />
            <span className="hide-mobile">Add Entry</span>
          </button>
        </div>
      </header>

      <main className="main-content">
        {showCollapsed ? (
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
            setSlots={setSlots}
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
