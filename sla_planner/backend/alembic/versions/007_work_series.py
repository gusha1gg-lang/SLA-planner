"""Work series (цикличные плановые работы)

Добавляет таблицу `work_series` (шаблон еженедельной серии) и колонку
`planned_works.series_id` — ссылку вхождения на серию.

Миграция идемпотентна: в dev-режиме таблицу/колонку мог уже создать
Base.metadata.create_all на старте приложения.

Revision ID: 007_work_series
Revises: 006_graph_node_colors
Create Date: 2026-10-12

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "007_work_series"
down_revision = "006_graph_node_colors"
branch_labels = None
depends_on = None

TABLE = "work_series"
FK_NAME = "fk_planned_works_series_id"


def _has_table(bind) -> bool:
    return TABLE in sa.inspect(bind).get_table_names()


def _has_column(bind, table: str, column: str) -> bool:
    cols = {c["name"] for c in sa.inspect(bind).get_columns(table)}
    return column in cols


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind):
        op.create_table(
            TABLE,
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("service_id", sa.Integer(), nullable=False),
            sa.Column("sla_id", sa.Integer(), nullable=False),
            sa.Column("weekdays", sa.String(length=20), nullable=False),
            sa.Column("start_time", sa.String(length=5), nullable=False),
            sa.Column("duration_minutes", sa.Integer(), nullable=False, server_default="60"),
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_by", sa.Integer(), nullable=False),
            sa.Column("updated_by", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.ForeignKeyConstraint(["service_id"], ["services.id"]),
            sa.ForeignKeyConstraint(["sla_id"], ["slas.id"]),
            sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
            sa.ForeignKeyConstraint(["updated_by"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if "planned_works" in sa.inspect(bind).get_table_names() and not _has_column(bind, "planned_works", "series_id"):
        op.add_column("planned_works", sa.Column("series_id", sa.Integer(), nullable=True))
        # SQLite не умеет ALTER ... ADD CONSTRAINT — FK только для Postgres.
        if bind.dialect.name == "postgresql":
            op.create_foreign_key(FK_NAME, "planned_works", TABLE, ["series_id"], ["id"])


def downgrade() -> None:
    bind = op.get_bind()
    if "planned_works" in sa.inspect(bind).get_table_names() and _has_column(bind, "planned_works", "series_id"):
        if bind.dialect.name == "postgresql":
            op.drop_constraint(FK_NAME, "planned_works", type_="foreignkey")
        op.drop_column("planned_works", "series_id")
    if _has_table(bind):
        op.drop_table(TABLE)
