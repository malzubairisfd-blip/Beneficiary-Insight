import React from "react";
import { LayoutProvider } from "./components/LayoutProvider";
import UploadPage from "./pages/UploadPage";

export default function App() {
  return (
    <LayoutProvider>
      <UploadPage />
    </LayoutProvider>
  );
}
