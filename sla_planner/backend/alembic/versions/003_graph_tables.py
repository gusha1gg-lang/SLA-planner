"""Add graph layout/colors tables

Revision ID: 003_graph_tables
Revises: 002_add_service_tags
Create Date: 2026-10-10

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '003_graph_tables'
down_revision = '002_add_service_tags'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Раскладка узлов моделей здоровья (общая для всех пользователей)
    op.create_table(
        'graph_node_positions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('model_key', sa.String(length=255), nullable=False),
        sa.Column('node_key', sa.String(length=255), nullable=False),
        sa.Column('x', sa.Float(), nullable=False),
        sa.Column('y', sa.Float(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('model_key', 'node_key', name='uq_graph_pos_model_node'),
    )
    op.create_index('ix_graph_node_positions_model_key', 'graph_node_positions', ['model_key'], unique=False)

    # Цвета узлов графа (sla/service, общие для всех моделей)
    op.create_table(
        'graph_node_styles',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('node_type', sa.String(length=50), nullable=False),
        sa.Column('color', sa.String(length=9), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('node_type', name='uq_graph_style_type'),
    )


def downgrade() -> None:
    op.drop_table('graph_node_styles')
    op.drop_index('ix_graph_node_positions_model_key', table_name='graph_node_positions')
    op.drop_table('graph_node_positions')
