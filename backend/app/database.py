import sqlite3
import os
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "paperwise.db")


def get_db_path() -> str:
    return DB_PATH


@contextmanager
def get_conn():
    conn = sqlite3.connect(
        DB_PATH
    )
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS detection_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                operation_type TEXT NOT NULL,
                original_ai_score REAL,
                rewritten_ai_score REAL,
                rewrite_level TEXT,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_detection_history_created_at
                ON detection_history(created_at)
            """)


def save_record(
    operation_type: str,
    original_ai_score: Optional[float] = None,
    rewritten_ai_score: Optional[float] = None,
    rewrite_level: Optional[str] = None,
) -> int:
    now = datetime.now().isoformat()
    with get_conn() as conn:
        cursor = conn.execute(
            """
            INSERT INTO detection_history
            (timestamp, operation_type, original_ai_score, rewritten_ai_score, rewrite_level, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (now, operation_type, original_ai_score, rewritten_ai_score, rewrite_level, now),
        )
        return cursor.lastrowid


def get_records(
    days: Optional[int] = None) -> List[Dict[str, Any]]:
    query = "SELECT * FROM detection_history"
    params: tuple = ()
    if days is not None and days > 0:
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        query += " WHERE created_at >= ?"
        params = (cutoff,)
    query += " ORDER BY created_at DESC"
    with get_conn() as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]


def get_daily_usage(days: Optional[int] = None) -> List[Dict[str, Any]]:
    where_clause = ""
    params: tuple = ()
    if days is not None and days > 0:
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        where_clause = " WHERE created_at >= ?"
        params = (cutoff,)
    query = f"""
        SELECT
            DATE(created_at) as date,
            COUNT(*) as count
        FROM detection_history
        {where_clause}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
    """
    with get_conn() as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]


def get_rewrite_level_distribution(days: Optional[int] = None) -> List[Dict[str, Any]]:
    where_clause = " WHERE rewrite_level IS NOT NULL"
    params: tuple = ()
    if days is not None and days > 0:
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        where_clause += " AND created_at >= ?"
        params = (cutoff,)
    query = f"""
        SELECT
            rewrite_level as level,
            COUNT(*) as count
        FROM detection_history
        {where_clause}
        GROUP BY rewrite_level
        ORDER BY count DESC
    """
    with get_conn() as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]


def get_ai_score_trend(days: Optional[int] = None) -> List[Dict[str, Any]]:
    where_clause = ""
    params: tuple = ()
    if days is not None and days > 0:
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        where_clause = " WHERE created_at >= ?"
        params = (cutoff,)
    query = f"""
        SELECT
            id,
            timestamp,
            created_at,
            operation_type,
            original_ai_score,
            rewritten_ai_score
        FROM detection_history
        {where_clause}
        ORDER BY created_at ASC
    """
    with get_conn() as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]


init_db()
