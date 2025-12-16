import React from "react";

/**
 * Minimal layout provider adapted from your Next layout.
 * Replace icons and exact styles with your ShadCN components and Tailwind classes.
 */
export const LayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="flex h-screen">
      <aside className="w-64 bg-gray-50 border-r">
        <div className="p-4 font-semibold">Beneficiary Insights</div>
        <nav className="p-4 space-y-2 text-sm">
          <div>Dashboard</div>
          <div>Upload Data</div>
          <div>Review Clusters</div>
          <div>Run Audit</div>
          <div>Export Report</div>
          <div>Settings</div>
        </nav>
        <div className="mt-auto p-4 text-xs text-gray-500">© {new Date().getFullYear()}</div>
      </aside>
      <main className="flex-1 p-6 overflow-auto bg-white">{children}</main>
    </div>
  );
};
