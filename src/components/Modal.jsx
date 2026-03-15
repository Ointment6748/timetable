import React, { useState, useEffect } from 'react';
import { X, Trash2, Copy, Save } from 'lucide-react';
import { DAYS, COLORS } from '../utils/constants';

const Modal = ({ isOpen, onClose, slot, onSave, onDelete, onDuplicate, activeHours }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    day: DAYS[0],
    startHour: activeHours?.[0] || 8,
    endHour: (activeHours?.[0] || 8) + 1,
    color: 'blue',
  });

  useEffect(() => {
    if (slot) {
      setFormData(slot);
    }
  }, [slot]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: ['startHour', 'endHour'].includes(name) ? parseFloat(value) : value,
    }));
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (formData.startHour >= formData.endHour) {
      alert("End time must be after start time");
      return;
    }
    onSave(formData);
  };

  const isEditing = !!slot?.id;

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div 
        className="modal-content glass animate-pop-in" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="heading-gradient">{isEditing ? 'Edit Entry' : 'Add Entry'}</h2>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <form onSubmit={handleSave} className="modal-form">
          <div className="form-group">
            <label>Title</label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="e.g. Team Meeting"
              required
              autoFocus
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Day</label>
              <select name="day" value={formData.day} onChange={handleChange}>
                {DAYS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Start Time</label>
              <select name="startHour" value={formData.startHour} onChange={handleChange}>
                {activeHours.filter(h => h !== Math.max(...activeHours)).map((h) => {
                  const fraction = h % 1;
                  const hInt = Math.floor(h);
                  let min = '00';
                  if (fraction === 0.25) min = '15';
                  if (fraction === 0.5) min = '30';
                  if (fraction === 0.75) min = '45';

                  return (
                    <option key={h} value={h}>
                      {hInt > 12 ? hInt - 12 : hInt === 12 ? 12 : hInt}:{min} {hInt >= 12 && hInt < 24 ? 'PM' : 'AM'}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="form-group">
              <label>End Time</label>
              <select name="endHour" value={formData.endHour} onChange={handleChange}>
                {activeHours.filter(h => h > formData.startHour).map((h) => {
                  const fraction = h % 1;
                  const hInt = Math.floor(h);
                  let min = '00';
                  if (fraction === 0.25) min = '15';
                  if (fraction === 0.5) min = '30';
                  if (fraction === 0.75) min = '45';

                  return (
                    <option key={h} value={h}>
                      {hInt > 12 ? hInt - 12 : hInt === 12 ? 12 : hInt}:{min} {hInt >= 12 && hInt < 24 ? 'PM' : 'AM'}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Color</label>
            <div className="color-picker">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-btn bg-${c} ${formData.color === c ? 'selected' : ''}`}
                  onClick={() => setFormData({ ...formData, color: c })}
                  aria-label={`Select ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              name="description"
              value={formData.description || ''}
              onChange={handleChange}
              placeholder="Add details, links, or notes..."
              rows={3}
            />
          </div>

          <div className="modal-footer">
            {isEditing && (
              <div className="footer-left">
                <button 
                  type="button" 
                  className="icon-btn text-danger" 
                  onClick={() => onDelete(slot.id)}
                  title="Delete"
                >
                  <Trash2 size={20} />
                </button>
                {onDuplicate && (
                  <button 
                    type="button" 
                    className="icon-btn text-primary" 
                    onClick={() => onDuplicate(slot)}
                    title="Duplicate"
                  >
                    <Copy size={20} />
                  </button>
                )}
              </div>
            )}
            <div className="footer-right">
              <button type="button" className="secondary-btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="primary-btn">
                <Save size={18} />
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Modal;
