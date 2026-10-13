import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { TopNavbar } from './components/layout/TopNavbar';
import { DashboardPage } from './pages/DashboardPage';
import { NewPatientPage } from './pages/NewPatientPage';
import { QueuePage } from './pages/QueuePage';
import { AssessmentHistoryPage } from './pages/AssessmentHistoryPage';
import { ModelEvaluationPage } from './pages/ModelEvaluationPage';
import { QueueSimulationPage } from './pages/QueueSimulationPage';
import { GuidelinesPage } from './pages/GuidelinesPage';
import { SettingsPage } from './pages/SettingsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { EmergencyIntakeModal } from './components/emergency/EmergencyIntakeModal';
import { EmergencyIntakePage } from './pages/EmergencyIntakePage';
import { fetchHealth } from './services/api';
import { LanguageProvider } from './context/LanguageContext';
import { AuthProvider } from './context/AuthContext';

export function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [isBackendHealthy, setIsBackendHealthy] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const checkBackend = async () => {
      try {
        const data = await fetchHealth();
        if (isMounted) {
          setIsBackendHealthy(data.status === 'healthy');
        }
      } catch {
        if (isMounted) {
          setIsBackendHealthy(false);
        }
      }
    };

    checkBackend();
    const interval = setInterval(checkBackend, 25000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleToggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const handleOpenRegisterModal = () => {
    setIsRegisterModalOpen(true);
  };

  const handleCloseRegisterModal = () => {
    setIsRegisterModalOpen(false);
  };

  const handleOpenEmergencyModal = () => {
    setIsEmergencyModalOpen(true);
  };

  const handleCloseEmergencyModal = () => {
    setIsEmergencyModalOpen(false);
  };

  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <div className="hospital-app-layout">
        {/* 1. Sidebar Navigation */}
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onRegisterClick={handleOpenRegisterModal}
          onEmergencyClick={handleOpenEmergencyModal}
        />

        {/* 2. Main Application Area */}
        <div className="hospital-main-wrapper">
          {/* Top Navbar */}
          <TopNavbar
            onToggleSidebar={handleToggleSidebar}
            onRegisterClick={handleOpenRegisterModal}
            onEmergencyClick={handleOpenEmergencyModal}
            isBackendHealthy={isBackendHealthy}
          />

          {/* Page Routing */}
          <main className="hospital-page-body">
            <Routes>
              <Route
                path="/"
                element={
                  <DashboardPage
                    onRegisterClick={handleOpenRegisterModal}
                    isRegisterModalOpen={isRegisterModalOpen}
                    onCloseRegisterModal={handleCloseRegisterModal}
                    onEmergencyClick={handleOpenEmergencyModal}
                  />
                }
              />
              <Route
                path="/dashboard"
                element={<Navigate to="/" replace />}
              />
              <Route
                path="/emergency-intake"
                element={<EmergencyIntakePage />}
              />
              <Route
                path="/emergency"
                element={<Navigate to="/emergency-intake" replace />}
              />
              <Route
                path="/new-patient"
                element={<NewPatientPage onEmergencyClick={handleOpenEmergencyModal} />}
              />
              <Route
                path="/queue"
                element={
                  <QueuePage
                    onRegisterClick={handleOpenRegisterModal}
                    isRegisterModalOpen={isRegisterModalOpen}
                    onCloseRegisterModal={handleCloseRegisterModal}
                    onEmergencyClick={handleOpenEmergencyModal}
                  />
                }
              />
              <Route
                path="/history"
                element={<AssessmentHistoryPage />}
              />
              <Route
                path="/evaluation"
                element={<ModelEvaluationPage />}
              />
              <Route
                path="/analytics"
                element={<AnalyticsPage />}
              />
              <Route
                path="/simulation"
                element={<QueueSimulationPage />}
              />
              <Route
                path="/digital-twin"
                element={<QueueSimulationPage />}
              />
              <Route
                path="/digital-twin-simulator"
                element={<Navigate to="/digital-twin" replace />}
              />
              <Route
                path="/guidelines"
                element={<GuidelinesPage />}
              />
              <Route
                path="/settings"
                element={<SettingsPage />}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>

          {/* Hospital Footer */}
          <footer className="hospital-app-footer">
            <div className="footer-left">
              <span>District Civil Hospital OPD • MediTriage AI Clinical Decision Support</span>
            </div>
            <div className="footer-right">
              <span className="footer-demo-tag">PROTOTYPE SIMULATION MODE • SYNTHETIC DATA</span>
            </div>
          </footer>
        </div>

        {/* Dedicated Emergency Accident Intake Modal (Feature 1, 2, 3) */}
        <EmergencyIntakeModal
          isOpen={isEmergencyModalOpen}
          onClose={handleCloseEmergencyModal}
        />
      </div>
      </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
