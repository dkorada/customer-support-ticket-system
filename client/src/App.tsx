import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { PageLoader } from './components/ui';
import { LoginPage } from './pages/Login';
import { MyTicketsPage } from './pages/MyTickets';
import { NewTicketPage } from './pages/NewTicket';
import { QueuePage } from './pages/Queue';
import { TicketDetailPage } from './pages/TicketDetail';
import { WorkflowPage } from './pages/Workflow';

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <LoginPage />;

  const isAgent = user.role === 'AGENT';
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to={isAgent ? '/queue' : '/tickets'} replace />} />
        {isAgent && <Route path="queue" element={<QueuePage />} />}
        {!isAgent && <Route path="tickets" element={<MyTicketsPage />} />}
        {!isAgent && <Route path="tickets/new" element={<NewTicketPage />} />}
        <Route path="tickets/:id" element={<TicketDetailPage />} />
        <Route path="workflow" element={<WorkflowPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
