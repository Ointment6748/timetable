import React, { useMemo, useEffect, useRef } from 'react';
import { DndContext, useSensor, useSensors, PointerSensor, TouchSensor } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { useDroppable } from '@dnd-kit/core';
import Slot from './Slot';
import { DAYS } from '../utils/constants';

// A single cell representing a Day/Hour intersection
const GridCell = ({ day, hour, slots, onCellClick, onSlotClick, intervalMinutes }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `${day}-${hour}`,
    data: { day, hour },
  });

  return (
    <div
      ref={setNodeRef}
      className={`grid-cell ${isOver ? 'cell-drag-over' : ''}`}
      onClick={(e) => {
        // Only trigger empty cell click if we didn't click inside a slot
        if (e.target === e.currentTarget) {
          onCellClick(day, hour);
        }
      }}
    >
      {slots.map((slot) => (
        <Slot
          key={slot.id}
          slot={slot}
          onClick={() => onSlotClick(slot)}
          cellHour={hour}
          intervalMinutes={intervalMinutes}
        />
      ))}
    </div>
  );
};

const JS_DAY_MAP = [6, 0, 1, 2, 3, 4, 5]; // Sunday is 0 inside JS Date() 

const TimetableGrid = ({ slots, weekDates, setSlots, onCellClick, onSlotClick, activeHours, intervalMinutes, scrollToHour, currentWeekOffset }) => {
  const gridRef = useRef(null);

  const todayIndex = JS_DAY_MAP[new Date().getDay()];
  const todayName = DAYS[todayIndex];

  useEffect(() => {
    if (scrollToHour !== undefined) {
      const timer = setTimeout(() => {
        if (!gridRef.current) return;
        const targetElement = document.getElementById(`time-row-${Math.floor(scrollToHour)}`);
        if (targetElement) {
          gridRef.current.scrollTo({
            top: Math.max(0, targetElement.offsetTop - 50), // 50px offset for the sticky header 
            behavior: 'smooth'
          });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [scrollToHour, activeHours]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return; // Dropped outside valid area

    const slotId = active.id;
    const { day: newDay, hour: newHour } = over.data.current;

    setSlots((prev) =>
      prev.map((slot) => {
        if (slot.id === slotId) {
          const duration = slot.endHour - slot.startHour;
          return {
            ...slot,
            day: newDay,
            startHour: newHour,
            endHour: newHour + duration, // Maintain original duration
          };
        }
        return slot;
      })
    );
  };

  // Group slots for faster lookup
  const slotsByCell = useMemo(() => {
    const map = new Map();
    slots.forEach((slot) => {
      // Find the grid interval that this slot belongs to!
      let cellHour = activeHours[0];
      for (let i = activeHours.length - 1; i >= 0; i--) {
        if (slot.startHour >= activeHours[i]) {
          cellHour = activeHours[i];
          break;
        }
      }

      const key = `${slot.day}-${cellHour}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(slot);
    });
    return map;
  }, [slots, activeHours]);

  return (
    <DndContext sensors={sensors} modifiers={[restrictToWindowEdges]} onDragEnd={handleDragEnd}>
      <div className="timetable-container animate-fade-in glass">
        <div className="timetable-grid" ref={gridRef}>
          {/* Header Row */}
          <div className="grid-header-corner glass-panel">Time</div>
          {DAYS.map((day, i) => {
            const isToday = currentWeekOffset === 0 && day === todayName;
            return (
              <div key={day} className={`grid-header glass-panel ${isToday ? 'current-day-col-header' : ''}`}>
                <div className="day-name">{day} {isToday && <span className="today-badge">(Today)</span>}</div>
                {weekDates && <div className="day-date">{weekDates[i]}</div>}
              </div>
            );
          })}

          {/* Time Rows */}
          {activeHours.map((hour) => {
            const fraction = hour % 1;
            const hourInt = Math.floor(hour);

            let minuteStr = '00';
            if (fraction === 0.25) minuteStr = '15';
            if (fraction === 0.5) minuteStr = '30';
            if (fraction === 0.75) minuteStr = '45';

            const label = `${hourInt > 12 ? hourInt - 12 : hourInt === 0 ? 12 : hourInt}:${minuteStr} ${hourInt >= 12 && hourInt < 24 ? 'PM' : 'AM'}`;

            return (
              <React.Fragment key={hour}>
                {/* Row Header (Time) */}
                <div
                  className="time-label"
                  id={fraction === 0 ? `time-row-${hourInt}` : undefined}
                >
                  {label}
                </div>

                {/* Cells for each day at this hour/half-hour */}
                {DAYS.map((day) => {
                  const cellSlots = slotsByCell.get(`${day}-${hour}`) || [];
                  const isToday = currentWeekOffset === 0 && day === todayName;

                  return (
                    <div key={`${day}-${hour}`} className={isToday ? 'current-day-cell' : ''} style={{ display: 'flex', flexDirection: 'column' }}>
                      <GridCell
                        day={day}
                        hour={hour}
                        slots={cellSlots}
                        onCellClick={onCellClick}
                        onSlotClick={onSlotClick}
                        intervalMinutes={intervalMinutes}
                      />
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </DndContext>
  );
};

export default TimetableGrid;
