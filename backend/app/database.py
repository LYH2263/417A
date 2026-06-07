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
        conn.execute("""
            CREATE TABLE IF NOT EXISTS terminology (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                term TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT '专有名词',
                description TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_terminology_term
            ON terminology(term)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_terminology_category
            ON terminology(category)
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


TERMINOLOGY_CATEGORIES = [
    "人名",
    "机构名",
    "专有名词",
    "公式符号",
    "化学术语",
    "医学术语",
    "法律术语",
    "其他"
]


def list_terminology(category: Optional[str] = None, search: Optional[str] = None) -> List[Dict[str, Any]]:
    query = "SELECT * FROM terminology"
    conditions = []
    params: tuple = ()
    if category:
        conditions.append("category = ?")
        params = params + (category,)
    if search:
        conditions.append("term LIKE ?")
        params = params + (f"%{search}%",)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY updated_at DESC"
    with get_conn() as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]


def get_terminology(term_id: int) -> Optional[Dict[str, Any]]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM terminology WHERE id = ?", (term_id,)).fetchone()
        return dict(row) if row else None


def create_terminology(term: str, category: str = "专有名词", description: Optional[str] = None) -> int:
    now = datetime.now().isoformat()
    with get_conn() as conn:
        existing = conn.execute("SELECT id FROM terminology WHERE term = ?", (term,)).fetchone()
        if existing:
            raise ValueError(f"术语 '{term}' 已存在")
        cursor = conn.execute(
            """
            INSERT INTO terminology (term, category, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (term, category, description, now, now),
        )
        return cursor.lastrowid


def update_terminology(term_id: int, term: Optional[str] = None, category: Optional[str] = None, description: Optional[str] = None) -> bool:
    now = datetime.now().isoformat()
    fields = []
    params: tuple = ()
    if term is not None:
        fields.append("term = ?")
        params = params + (term,)
    if category is not None:
        fields.append("category = ?")
        params = params + (category,)
    if description is not None:
        fields.append("description = ?")
        params = params + (description,)
    if not fields:
        return False
    fields.append("updated_at = ?")
    params = params + (now, term_id)
    with get_conn() as conn:
        cursor = conn.execute(
            f"UPDATE terminology SET {', '.join(fields)} WHERE id = ?",
            params,
        )
        return cursor.rowcount > 0


def delete_terminology(term_id: int) -> bool:
    with get_conn() as conn:
        cursor = conn.execute("DELETE FROM terminology WHERE id = ?", (term_id,))
        return cursor.rowcount > 0


def bulk_import_terminology(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    now = datetime.now().isoformat()
    created = 0
    updated = 0
    skipped = 0
    errors = []
    with get_conn() as conn:
        for idx, item in enumerate(items):
            try:
                term = (item.get("term") or "").strip()
                if not term:
                    skipped += 1
                    continue
                category = (item.get("category") or "专有名词").strip()
                description = item.get("description") or None
                if isinstance(description, str):
                    description = description.strip() or None
                existing = conn.execute("SELECT id FROM terminology WHERE term = ?", (term,)).fetchone()
                if existing:
                    conn.execute(
                        "UPDATE terminology SET category = ?, description = ?, updated_at = ? WHERE id = ?",
                        (category, description, now, existing["id"]),
                    )
                    updated += 1
                else:
                    conn.execute(
                        """
                        INSERT INTO terminology (term, category, description, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (term, category, description, now, now),
                    )
                    created += 1
            except Exception as e:
                errors.append(f"第 {idx + 1} 行: {str(e)}")
                skipped += 1
    return {"created": created, "updated": updated, "skipped": skipped, "errors": errors}


def get_all_terminology_terms() -> List[Dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute("SELECT id, term, category, description FROM terminology ORDER BY LENGTH(term) DESC").fetchall()
        return [dict(r) for r in rows]


init_db()
