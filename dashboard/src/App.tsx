import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store';
import { useWebSocket } from './hooks/useWebSocket';
import { useCallback } from 'react';
import Layout from './components/Layout';
import Login from './pages/Login';
import DeviceList from './pages/DeviceList';
import DeviceDetail from './pages/DeviceDetail';
import TaskList from './pages/TaskList';
import TaskCreate from './pages/TaskCreate';
import AccountList from './pages/AccountList';

function AppInner() {
  const updateLiveInfo = useStore(s => s.updateLiveInfo);

  const handleWsMessage = useCallback((msg: any) => {
    switch (msg.type) {
      case 'device_online':
        updateLiveInfo(msg.deviceId, { currentApp: '', battery: 0, screenOn: true });
        break;
      case 'device_offline':
        updateLiveInfo(msg.deviceId, {});
        break;
      case 'device_heartbeat':
        updateLiveInfo(msg.deviceId, {
          battery: msg.battery,
          currentApp: msg.currentApp,
          screenOn: msg.screenOn,
        });
        break;
      case 'device_screenshot':
        updateLiveInfo(msg.deviceId, { screenshot: msg.data });
        break;
      case 'task_status_update':
        updateLiveInfo(msg.deviceId, {
          taskStatus: msg.status,
          taskStep: msg.step,
          taskMessage: msg.message,
        });
        break;
    }
  }, [updateLiveInfo]);

  useWebSocket(handleWsMessage);

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DeviceList />} />
        <Route path="/devices/:id" element={<DeviceDetail />} />
        <Route path="/tasks" element={<TaskList />} />
        <Route path="/tasks/new" element={<TaskCreate />} />
        <Route path="/accounts" element={<AccountList />} />
      </Routes>
    </Layout>
  );
}

function App() {
  const isAuthenticated = useStore(s => s.isAuthenticated);

  return (
    <BrowserRouter>
      {isAuthenticated ? (
        <AppInner />
      ) : (
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}

export default App;
