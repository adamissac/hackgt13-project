"use client";

import dynamic from "next/dynamic";

// react-force-graph needs `window`: client-only. ssr:false is only allowed inside a Client Component.
const GraphCanvas = dynamic(() => import("./ConnectionGraph"), {
  ssr: false,
  loading: () => <div className="graph-skeleton" aria-hidden />,
});

export default GraphCanvas;
