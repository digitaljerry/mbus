'use client';

import { useState, useEffect } from 'react';
import { BusStop } from '../types';
import { loadPinnedStops, addPinnedStop, updatePinnedStop, removePinnedStop } from '../utils/storage';

interface BusStopManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onStopsChange: (stops: BusStop[]) => void;
}

export default function BusStopManager({ isOpen, onClose, onStopsChange }: BusStopManagerProps) {
  const [pinnedStops, setPinnedStops] = useState<BusStop[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<BusStop>>({
    name: '',
    stopId: '',
    route: '',
    description: ''
  });

  useEffect(() => {
    if (isOpen) {
      const stops = loadPinnedStops();
      setPinnedStops(stops);
    }
  }, [isOpen]);

  const handleAdd = () => {
    if (!formData.stopId || !formData.route || !formData.name) {
      alert('Please fill in Stop ID, Route, and Name');
      return;
    }

    const newStop: BusStop = {
      id: `stop-${Date.now()}`,
      name: formData.name!,
      stopId: formData.stopId!,
      route: formData.route!,
      description: formData.description || ''
    };

    addPinnedStop(newStop);
    const updated = loadPinnedStops();
    setPinnedStops(updated);
    onStopsChange(updated);
    
    // Reset form
    setFormData({ name: '', stopId: '', route: '', description: '' });
  };

  const handleEdit = (stop: BusStop) => {
    setEditingId(stop.id);
    setFormData({
      name: stop.name,
      stopId: stop.stopId,
      route: stop.route,
      description: stop.description || ''
    });
  };

  const handleUpdate = () => {
    if (!editingId || !formData.stopId || !formData.route || !formData.name) {
      alert('Please fill in all required fields');
      return;
    }

    updatePinnedStop(editingId, {
      name: formData.name!,
      stopId: formData.stopId!,
      route: formData.route!,
      description: formData.description || ''
    });

    const updated = loadPinnedStops();
    setPinnedStops(updated);
    onStopsChange(updated);
    
    // Reset form
    setEditingId(null);
    setFormData({ name: '', stopId: '', route: '', description: '' });
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to remove this stop?')) {
      removePinnedStop(id);
      const updated = loadPinnedStops();
      setPinnedStops(updated);
      onStopsChange(updated);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData({ name: '', stopId: '', route: '', description: '' });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-800">Manage Pinned Bus Stops</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        <div className="p-6">
          {/* Add/Edit Form */}
          <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              {editingId ? 'Edit Stop' : 'Add New Stop'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Friendly Name *
                </label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., 🏠 Home → 🏙️ City"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Stop ID *
                  </label>
                  <input
                    type="text"
                    value={formData.stopId || ''}
                    onChange={(e) => setFormData({ ...formData, stopId: e.target.value })}
                    placeholder="e.g., 255"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Route *
                  </label>
                  <input
                    type="text"
                    value={formData.route || ''}
                    onChange={(e) => setFormData({ ...formData, route: e.target.value })}
                    placeholder="e.g., G6"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g., From Home to City Center"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-2">
                {editingId ? (
                  <>
                    <button
                      onClick={handleUpdate}
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                    >
                      Update Stop
                    </button>
                    <button
                      onClick={handleCancel}
                      className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleAdd}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    Add Stop
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Pinned Stops List */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Pinned Stops ({pinnedStops.length})
            </h3>

            {pinnedStops.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No pinned stops yet. Add one above!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pinnedStops.map((stop) => (
                  <div
                    key={stop.id}
                    className="p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-800">{stop.name}</h4>
                        <div className="mt-1 text-sm text-gray-600">
                          <span className="inline-block mr-4">
                            <strong>Stop ID:</strong> {stop.stopId}
                          </span>
                          <span className="inline-block mr-4">
                            <strong>Route:</strong> {stop.route}
                          </span>
                        </div>
                        {stop.description && (
                          <p className="mt-1 text-sm text-gray-500">{stop.description}</p>
                        )}
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => handleEdit(stop)}
                          className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 text-sm font-medium rounded transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(stop.id)}
                          className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 text-sm font-medium rounded transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

