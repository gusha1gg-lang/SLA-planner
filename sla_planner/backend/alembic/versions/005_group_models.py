"""Add model scope to groups (all_models, model_ids)

Группа получает область моделей здоровья: all_models=True — видит все модели,
иначе — только перечисленные rootId (zabbix_serviceid корня модели).

Существующие группы переводятся в режим «все модели» (all_models=1) — чтобы
после обновления никто не потерял доступ. Миграция идемпотентна: в dev-режиме
колонки мог уже создать Base.metadata.create_all на старте приложения.

Revision ID: 005_group_models
Revises: 004_groups
Create Date: 2026-10-10

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "005_group_models"
down_revision = "004_groups"
branch_labels = None
depends_on = None


def _group_columns(bind) -> set[str]:
    inspector = sa.inspect(bind)
    if "groups" not in inspector.get_table_names():
        return set()
    return {col["name"] for col in inspector.get_columns("groups")}


def upgrade() -> None:
    bind = op.get_bind()
    cols = _group_columns(bind)

    with op.batch_alter_table("groups") as batch:
        if "all_models" not in cols:
            batch.add_column(
                sa.Column("all_models", sa.Boolean(), nullable=False, server_default=sa.text("1"))
            )
        if "model_ids" not in cols:
            batch.add_column(
                sa.Column("model_ids", sa.Text(), nullable=True, server_default=sa.text("'[]'"))
            )

    # Существующие группы — «все модели» (сохраняем прежнее поведение)
    if "all_models" not in cols and "groups" in sa.inspect(bind).get_table_names():
        op.execute("UPDATE groups SET all_models = 1 WHERE all_models IS NULL")


def downgrade() -> None:
    bind = op.get_bind()
    cols = _group_columns(bind)
    with op.batch_alter_table("groups") as batch:
        if "model_ids" in cols:
            batch.drop_column("model_ids")
        if "all_models" in cols:
            batch.drop_column("all_models")
