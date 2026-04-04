// Service Worker for WorkSwan – handles background reminders and badge updates
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
let tasksCache = [];

function getCurrentIST() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + IST_OFFSET_MS);
}

function toISTDate(isoString) {
  if (!isoString) return null;
  const utcDate = new Date(isoString);
  if (isNaN(utcDate.getTime())) return null;
  return new Date(utcDate.getTime() + IST_OFFSET_MS);
}

function formatDateTimeIST(isoString) {
  if (!isoString) return "Not set";
  const istDate = toISTDate(isoString);
  if (!istDate) return "Invalid date";
  const nowIST = getCurrentIST();
  const isToday = istDate.toDateString() === nowIST.toDateString();
  const tomorrowIST = new Date(nowIST);
  tomorrowIST.setDate(nowIST.getDate() + 1);
  const isTomorrow = istDate.toDateString() === tomorrowIST.toDateString();
  const timeStr = istDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today, ${timeStr}`;
  if (isTomorrow) return `Tomorrow, ${timeStr}`;
  return `${istDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
}

function checkAndNotify() {
  if (!tasksCache.length) return;
  const nowIST = getCurrentIST();
  let notifiedAny = false;

  tasksCache.forEach(task => {
    if (task.completed || task.notified) return;
    const triggerTime = task.reminderTime ? toISTDate(task.reminderTime) : (task.dueDate ? toISTDate(task.dueDate) : null);
    if (triggerTime && triggerTime <= nowIST) {
      const title = task.reminderTime ? "⏰ Reminder" : "📅 Task Due";
      const options = {
        body: `"${task.title}"${task.dueDate ? ` • Due: ${formatDateTimeIST(task.dueDate)}` : ''}`,
        icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"%3E%3Crect width="192" height="192" fill="%23C04657"/%3E%3Ctext x="96" y="130" font-size="110" text-anchor="middle" fill="white" font-family="Arial"%3E✓%3C/text%3E%3C/svg%3E',
        badge: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"%3E%3Crect width="192" height="192" fill="%23C04657"/%3E%3Ctext x="96" y="130" font-size="110" text-anchor="middle" fill="white" font-family="Arial"%3E✓%3C/text%3E%3C/svg%3E',
        tag: `task-${task.id}`,
        vibrate: [200, 100, 200],
        requireInteraction: true,
        data: { taskId: task.id }
      };
      self.registration.showNotification(title, options);
      task.notified = true;
      notifiedAny = true;
    }
  });

  if (notifiedAny) {
    self.clients.matchAll().then(clients => {
      clients.forEach(client => client.postMessage({ type: 'UPDATE_NOTIFIED', tasks: tasksCache }));
    });
  }
}

self.addEventListener('message', event => {
  if (event.data.type === 'SYNC_TASKS') {
    tasksCache = event.data.tasks || [];
    checkAndNotify();
  } else if (event.data.type === 'TEST_NOTIFICATION') {
    self.registration.showNotification('WorkSwan Test', {
      body: 'Notifications are working! You will receive reminders at the right IST time.',
      icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"%3E%3Crect width="192" height="192" fill="%23C04657"/%3E%3Ctext x="96" y="130" font-size="110" text-anchor="middle" fill="white" font-family="Arial"%3E✓%3C/text%3E%3C/svg%3E',
      badge: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"%3E%3Crect width="192" height="192" fill="%23C04657"/%3E%3Ctext x="96" y="130" font-size="110" text-anchor="middle" fill="white" font-family="Arial"%3E✓%3C/text%3E%3C/svg%3E'
    });
  }
});

setInterval(() => {
  if (tasksCache.length) checkAndNotify();
}, 30000);

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.matchAll().then(clients => {
    clients.forEach(client => client.postMessage({ type: 'SW_READY' }));
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const taskId = event.notification.data?.taskId;
  if (taskId) {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        for (let client of clients) {
          if (client.url.includes('index.html') && 'focus' in client) {
            client.postMessage({ type: 'NOTIFICATION_CLICK', taskId });
            return client.focus();
          }
        }
        return self.clients.openWindow('/');
      })
    );
  }
});