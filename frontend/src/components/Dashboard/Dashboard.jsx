//frontend/src/components/Dashboard/Dashboard.js
import React from 'react';
import { LogOut, Home } from 'lucide-react';

const Dashboard = ({ role, onLogout }) => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <Home className="text-blue-600" size={28} />
            <div>
              <h1 className="text-xl font-semibold text-gray-800">Ecotrend Housing</h1>
              <p className="text-xs text-gray-500">{role} Dashboard</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </nav>
      
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <div className="mb-6">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">🏠</span>
            </div>
            <h2 className="text-4xl font-bold text-gray-800 mb-2">{role}</h2>
            <p className="text-gray-600 mb-4">Welcome, {user.username || 'User'}!</p>
          </div>
          
          <div className="border-t pt-6">
            <p className="text-gray-500">Dashboard features coming soon...</p>
            <p className="text-sm text-gray-400 mt-2">More functionality will be added here</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
