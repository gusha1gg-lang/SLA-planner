"""Add service_tags to SLA

Revision ID: 002_add_service_tags
Revises: 001_initial
Create Date: 2026-10-06

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '002_add_service_tags'
down_revision = '001_initial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add service_tags column to slas table
    op.add_column('slas', sa.Column('service_tags', sa.Text(), nullable=True))


def downgrade() -> None:
    # Remove service_tags column from slas table
    op.drop_column('slas', 'service_tags')
