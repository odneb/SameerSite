export type AdminState = {
  status: "idle" | "saved" | "published" | "error";
  message: string | null;
  /** Forces a re-render even when the message repeats. */
  at: number;
};

export const initialAdminState: AdminState = { status: "idle", message: null, at: 0 };

export type RestoreState = {
  status: "idle" | "ok" | "error";
  message: string | null;
  at: number;
};

export const initialRestoreState: RestoreState = {
  status: "idle",
  message: null,
  at: 0,
};
