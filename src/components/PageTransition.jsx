import React from "react";
import { motion } from "framer-motion";

export default function PageTransition({ children }) {
  return (
    <motion.div
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "-100%", opacity: 0 }}
      transition={{ type: "tween", duration: 0.2 }}
      style={{ overflow: "hidden", minHeight: "100%" }}
    >
      {children}
    </motion.div>
  );
}