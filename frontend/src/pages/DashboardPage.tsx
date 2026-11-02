import React, { useEffect, useState } from 'react';

export default function DashboardPage() {
  const [children, setChildren] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChildren = async () => {
      try {
        const response = await fetch('/api/user/children');
        const data = await response.json();
        setChildren(data);
      } catch (error) {
        console.error('Failed to fetch children:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchChildren();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-gray-800">Dashboard</h1>

        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {children.map((child) => (
              <div key={child.id} className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition">
                <h2 className="text-2xl font-bold mb-2">{child.name}</h2>
                <p className="text-gray-600 mb-4">Age: {child.age}</p>
                <button className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">
                  View Progress
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
