import { Routes, Route } from "react-router-dom";
import Join from "./pages/Join";
import Screen from "./pages/Screen";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Join />} />
      <Route path="/screen" element={<Screen />} />
    </Routes>
  );
}
