"""Add per-model node colors (graph_node_colors)

Цвет можно задать каждому узлу (услуге/SLA) внутри модели здоровья, и он свой
у каждой модели. Базовые цвета типов остаются в graph_node_styles.

Миграция идемпотентна: в dev-режиме таблицу мог уже создать
Base.metadata.create_all на старте приложения.

Revision ID: 006_graph_node_colors
Revises: 005_group_models
Create Date: 2026-10-12

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "006_graph_node_colors"
down_revision = "005_group_models"
branch_labels = None
depends_on = None

TABLE = "graph_node_colors"


def _has_table(bind) -> bool:
    return TABLE in sa.inspect(bind).get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind):
        return
    op.create_table(
        TABLE,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("model_key", sa.String(length=255), nullable=False),
        sa.Column("node_key", sa.String(length=255), nullable=False),
        sa.Column("color", sa.String(length=9), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("model_key", "node_key", name="uq_graph_node_color"),
    )
    op.create_index(f"ix_{TABLE}_model_key", TABLE, ["model_key"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind):
        return
    op.drop_index(f"ix_{TABLE}_model_key", table_name=TABLE)
    op.drop_table(TABLE)
