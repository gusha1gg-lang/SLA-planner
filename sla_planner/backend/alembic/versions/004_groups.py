"""Add groups and user_groups tables

Вводит модель прав в стиле Grafana: роли "admin"/"user", права пользователя
приходят из групп (см. app.permissions).

Таблицы создаются с проверкой существования: в dev-режиме их мог уже создать
Base.metadata.create_all на старте приложения, поэтому миграция идемпотентна.

Revision ID: 004_groups
Revises: 003_graph_tables
Create Date: 2026-10-10

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '004_groups'
down_revision = '003_graph_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    # Группы (команды): набор прав + состав участников
    if 'groups' not in tables:
        op.create_table(
            'groups',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('description', sa.String(length=255), nullable=True),
            sa.Column('permissions', sa.Text(), nullable=True),  # JSON-список прав
            sa.Column('is_system', sa.Boolean(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
        )

    # Уникальный индекс по имени группы
    existing_indexes = (
        {ix['name'] for ix in inspector.get_indexes('groups')}
        if 'groups' in inspector.get_table_names()
        else set()
    )
    if 'ix_groups_name' not in existing_indexes:
        op.create_index('ix_groups_name', 'groups', ['name'], unique=True)

    # Связь пользователь ↔ группа (многие-ко-многим)
    if 'user_groups' not in tables:
        op.create_table(
            'user_groups',
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('group_id', sa.Integer(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.ForeignKeyConstraint(['group_id'], ['groups.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('user_id', 'group_id'),
        )


def downgrade() -> None:
    op.drop_table('user_groups')
    op.drop_index('ix_groups_name', table_name='groups')
    op.drop_table('groups')