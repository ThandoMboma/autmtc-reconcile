/**
 * Persistence boundary. The app currently stores the workspace in the browser.
 * To move to a hosted database later, implement ReconcileRepository against the
 * database tables (same shapes as ReconcileState) and swap `activeRepository`.
 */
import type { ReconcileState } from "./actions";

export interface ReconcileRepository {
  load(): Promise<ReconcileState | null>;
  save(state: ReconcileState): Promise<void>;
  clear(): Promise<void>;
}

const KEY = "autmtc-reconcile:workspace:v1";

export const browserRepository: ReconcileRepository = {
  async load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ReconcileState;
      return parsed?.version === 1 ? parsed : null;
    } catch {
      return null;
    }
  },
  async save(state) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full or disabled: keep working in memory */
    }
  },
  async clear() {
    window.localStorage.removeItem(KEY);
  },
};

export const activeRepository: ReconcileRepository = browserRepository;
