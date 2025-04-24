import React from 'react';

interface BluetoothDevice {
  deviceId: string;
  label: string;
}

interface BluetoothDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableDevices: BluetoothDevice[];
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string) => void;
}

const BluetoothDeviceModal: React.FC<BluetoothDeviceModalProps> = ({
  isOpen,
  onClose,
  availableDevices,
  selectedDeviceId,
  onSelectDevice,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Select Bluetooth Device</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {availableDevices.length === 0 ? (
          <p className="text-gray-500 my-4">No Bluetooth devices found.</p>
        ) : (
          <ul className="space-y-2 max-h-64 overflow-y-auto my-4">
            {availableDevices.map((device) => (
              <li key={device.deviceId}>
                <button
                  className={`w-full text-left p-2 rounded-md flex items-center ${
                    selectedDeviceId === device.deviceId
                      ? 'bg-blue-100 text-blue-800'
                      : 'hover:bg-gray-100'
                  }`}
                  onClick={() => onSelectDevice(device.deviceId)}
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-5 w-5 mr-2 text-blue-500" 
                    viewBox="0 0 20 20" 
                    fill="currentColor"
                  >
                    <path d="M11 12.293l-3.293-3.293 1.414-1.414L11 9.464V3h2v6.464l2.293-2.293 1.414 1.414L13 12.292l3.707 3.707-1.414 1.414L13 14.828V20h-2v-5.172l-2.293 2.293-1.414-1.414L11 12.293z" />
                  </svg>
                  {device.label || `Device (${device.deviceId.slice(0, 8)}...)`}
                </button>
              </li>
            ))}
          </ul>
        )}
        
        <div className="flex justify-between mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default BluetoothDeviceModal; 