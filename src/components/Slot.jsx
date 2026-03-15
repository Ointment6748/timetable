import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

const Slot = ({ slot, onClick, cellHour, intervalMinutes }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: slot.id,
    data: slot, 
  });

  const intervalHours = (intervalMinutes || 60) / 60;
  const safeCellHour = cellHour ?? slot.startHour;
  const topOffset = ((slot.startHour - safeCellHour) / intervalHours) * 100;
  const heightPercent = ((slot.endHour - slot.startHour) / intervalHours) * 100;

  const style = {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 999 : 1,
    opacity: isDragging ? 0.8 : 1,
    boxShadow: isDragging ? 'var(--shadow-glow)' : 'var(--shadow-md)',
    position: 'absolute',
    top: `calc(${topOffset}% + 4px)`,
    height: `calc(${heightPercent}% - 8px)`,
    left: '4px',
    right: '4px',
  };

  const bgClass = `bg-${slot.color}`;

  // Time formatter
  const formatTime = (hourNum) => {
    const fraction = hourNum % 1;
    const hInt = Math.floor(hourNum);
    let minStr = '00';
    if (fraction === 0.25) minStr = '15';
    if (fraction === 0.5) minStr = '30';
    if (fraction === 0.75) minStr = '45';
    
    const ampm = hInt >= 12 && hInt !== 24 ? 'PM' : 'AM';
    const displayHour = hInt > 12 ? hInt - 12 : hInt === 0 ? 12 : hInt;
    return `${displayHour}:${minStr} ${ampm}`;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`timetable-slot ${bgClass}`}
      onClick={(e) => {
        if (!isDragging) {
          e.stopPropagation();
          onClick();
        }
      }}
      {...attributes}
      {...listeners}
    >
      <div className="slot-content">
        <h4 className="slot-title">{slot.title || 'Untitled Event'}</h4>
        <p className="slot-time">
          {formatTime(slot.startHour)} - {formatTime(slot.endHour)}
        </p>
      </div>
    </div>
  );
};

export default Slot;
