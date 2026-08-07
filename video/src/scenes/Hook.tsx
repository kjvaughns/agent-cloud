import React from "react";
import { AbsoluteFill } from "remotion";
import { PunchWords } from "../components/Type";
import { GOLD } from "../lib/theme";

/**
 * Beats 0-4. Two seconds of black and four words.
 *
 * Deliberately not a logo. A launch reel that opens on a mark spends its only
 * cheap attention on the one thing the viewer has no reason to care about yet;
 * the product is on screen at beat 4 and the mark waits until the endcard,
 * where it means something.
 *
 * The line is the pitch compressed to four words: ten tools is the problem,
 * one agency is the promise, and the gold on the second half is the first time
 * the brand colour appears.
 */
export const Hook: React.FC = () => (
  <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
    <PunchWords
      start={5}
      size={130}
      lines={[{ words: ["Ten", "tools."] }, { words: ["One", "agency."], color: GOLD }]}
    />
  </AbsoluteFill>
);
