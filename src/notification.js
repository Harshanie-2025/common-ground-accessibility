
const STORAGE_KEY = 'accessfix-notifications';

let notifications = [];

function loadNotifications() {
  try {
    notifications = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || '[]'
    );
  } catch {
    notifications = [];
  }
}

function saveNotifications() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(notifications)
  );
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
