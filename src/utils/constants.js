export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const HOURS = Array.from({ length: 25 }, (_, i) => i); // 0 AM (Midnight) to 24 (Midnight next day)
export const COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink'];

// Helper to generate hours sequence based on granularity (60 min or 30 min)
export const generateHours = (intervalMinutes) => {
  const hours = [];
  const start = 0; // 12:00 AM Midnight
  const end = 23; // 11:00 PM
  const step = intervalMinutes === 60 ? 1 : intervalMinutes === 30 ? 0.5 : 0.25;
  for (let h = start; h <= end; h += step) {
    hours.push(h);
  }
  return hours;
};

// Helper for random color
export const getRandomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];
