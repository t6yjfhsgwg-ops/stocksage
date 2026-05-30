import React from "react";
import { createRoot } from "react-dom/client";
import StockSage from "../StockSage.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <StockSage />
  </React.StrictMode>
);
