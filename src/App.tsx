import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Calls } from '@/screens/Calls';
import { Insights } from '@/screens/Insights';
import { Login } from '@/screens/Login';
import { Queue } from '@/screens/Queue';
import { Settings } from '@/screens/Settings';
import { Sheets } from '@/screens/Sheets';
import { TicketView } from '@/screens/TicketView';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route element={<AppShell />}>
        <Route path="/queue" element={<Queue />} />
        <Route path="/mine" element={<Queue mineOnly />} />
        <Route path="/tickets/:id" element={<TicketView />} />
        <Route path="/calls" element={<Calls />} />
        <Route path="/sheets" element={<Sheets />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/queue" replace />} />
    </Routes>
  );
}
