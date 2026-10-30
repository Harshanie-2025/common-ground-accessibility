
const STORAGE_KEY = 'accessfix-notifications';

let notifications = [];

function loadNotifications() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    notifications = Array.isArray(saved) ? saved.slice(0, 50) : [];
  } catch {
    notifications = [];
  }
}

function saveNotifications() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  } catch {
    // Keep the in-memory list usable if browser storage is blocked or full.
  }
}

export function getNotifications() {
  return notifications;
}

export function addNotification(title, message, type = 'info') {
  const notification = {
    id: Date.now() + Math.random(),
    title,
    message,
    type,
    time: new Date().toISOString(),
    read: false
  };

  notifications.unshift(notification);

  // Keep the latest 50 notifications
  notifications = notifications.slice(0, 50);

  saveNotifications();

  return notification;
}

export function markAsRead(id) {
  notifications = notifications.map(notification =>
    notification.id === id
      ? { ...notification, read: true }
      : notification
  );

  saveNotifications();
}

export function markAllAsRead() {
  notifications = notifications.map(notification => ({
    ...notification,
    read: true
  }));

  saveNotifications();
}

export function clearNotifications() {
  notifications = [];
  saveNotifications();
}

loadNotifications();
