"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * False while rendering on the server and through hydration, true afterwards.
 *
 * Anything that would render differently on the client — an entry animation, a
 * loading state — has to be held back until the markup React was given matches
 * the markup it produced, or hydration warns and sometimes discards the tree.
 *
 * The obvious version of this is a `useState` flipped from an effect, which
 * React now flags: setting state in an effect body schedules a second render
 * pass on every mount. Reading the value as an external store gets the same two
 * answers with none of the cascade, because React already knows to re-read it
 * once hydration is finished.
 */
export function useHydrated() {
  return useSyncExternalStore(subscribe, onClient, onServer);
}
