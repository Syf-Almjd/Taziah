"use server";

import { db } from "@/lib/db";

export interface CondolenceItem {
  id: string | number;
  name: string;
  message: string;
  date: string;
}

export async function getCondolences(): Promise<CondolenceItem[]> {
  try {
    const stmt = db.prepare(
      "SELECT id, name, message, created_at FROM condolences WHERE approved = 1 ORDER BY id DESC"
    );
    const rows = stmt.all() as any[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      message: row.message,
      date: row.created_at,
    }));
  } catch (error) {
    console.error("Failed to load condolences", error);
    return [];
  }
}

export async function addCondolence(name: string, message: string) {
  try {
    const isoDate = new Date().toISOString();
    const stmt = db.prepare(
      "INSERT INTO condolences (name, message, created_at, approved) VALUES (?, ?, ?, 1)"
    );
    const info = stmt.run(name, message, isoDate);
    return {
      ok: true,
      data: {
        id: Number(info.lastInsertRowid),
        name,
        message,
        date: isoDate,
      },
    };
  } catch (error) {
    console.error("Failed to add condolence", error);
    return { ok: false, error: String(error) };
  }
}

export async function getTrackStats() {
  try {
    const stmt = db.prepare("SELECT track_id, plays, downloads FROM track_stats");
    const rows = stmt.all() as any[];
    const result: Record<string, { plays: number; downloads: number }> = {};
    rows.forEach((row) => {
      result[row.track_id] = {
        plays: row.plays,
        downloads: row.downloads,
      };
    });
    return result;
  } catch (error) {
    console.error("Failed to get track stats", error);
    return {};
  }
}

export async function incrementTrackStat(trackId: string, event: "play" | "download") {
  try {
    const checkStmt = db.prepare("SELECT track_id FROM track_stats WHERE track_id = ?");
    const exists = checkStmt.get(trackId);

    if (!exists) {
      const insertStmt = db.prepare(
        "INSERT INTO track_stats (track_id, plays, downloads) VALUES (?, ?, ?)"
      );
      insertStmt.run(trackId, event === "play" ? 1 : 0, event === "download" ? 1 : 0);
    } else {
      const updateStmt = db.prepare(
        event === "play"
          ? "UPDATE track_stats SET plays = plays + 1 WHERE track_id = ?"
          : "UPDATE track_stats SET downloads = downloads + 1 WHERE track_id = ?"
      );
      updateStmt.run(trackId);
    }
    return { ok: true };
  } catch (error) {
    console.error("Failed to increment track stat", error);
    return { ok: false, error: String(error) };
  }
}
