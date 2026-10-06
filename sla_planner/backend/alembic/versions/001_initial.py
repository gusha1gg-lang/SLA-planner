"""Initial migration — create all tables.

Revision ID: 001_initial
Revises: 
Create Date: 2024-01-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Users
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('username', sa.String(length=100), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('role', sa.String(length=20), nullable=False, server_default='viewer'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('username'),
    )
    op.create_index('ix_users_username', 'users', ['username'], unique=False)

    # SLAs
    op.create_table(
        'slas',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('zabbix_slaid', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('slo', sa.Float(), nullable=False),
        sa.Column('schedule_type', sa.String(length=20), nullable=True, server_default='24x7'),
        sa.Column('schedule_json', sa.Text(), nullable=True),
        sa.Column('synced_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('zabbix_slaid'),
    )
    op.create_index('ix_slas_zabbix_slaid', 'slas', ['zabbix_slaid'], unique=False)

    # Services
    op.create_table(
        'services',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('zabbix_serviceid', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('parent_zabbix_serviceid', sa.String(length=50), nullable=True),
        sa.Column('algorithm', sa.String(length=10), nullable=True, server_default='0'),
        sa.Column('sortorder', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('status', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('tags', sa.Text(), nullable=True),
        sa.Column('synced_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('zabbix_serviceid'),
    )
    op.create_index('ix_services_zabbix_serviceid', 'services', ['zabbix_serviceid'], unique=False)

    # SLA-Service Links
    op.create_table(
        'sla_service_links',
        sa.Column('sla_id', sa.Integer(), nullable=False),
        sa.Column('service_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['service_id'], ['services.id']),
        sa.ForeignKeyConstraint(['sla_id'], ['slas.id']),
        sa.PrimaryKeyConstraint('sla_id', 'service_id'),
    )

    # Planned Works
    op.create_table(
        'planned_works',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('service_id', sa.Integer(), nullable=False),
        sa.Column('sla_id', sa.Integer(), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('ended_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=True, server_default='draft'),
        sa.Column('downtime_marker', sa.String(length=100), nullable=True),
        sa.Column('downtime_period_from', sa.String(length=20), nullable=True),
        sa.Column('downtime_period_to', sa.String(length=20), nullable=True),
        sa.Column('sync_error', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('updated_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['service_id'], ['services.id']),
        sa.ForeignKeyConstraint(['sla_id'], ['slas.id']),
        sa.ForeignKeyConstraint(['updated_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    # Audit Logs
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('action', sa.String(length=50), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=True),
        sa.Column('payload', sa.Text(), nullable=True),
        sa.Column('result', sa.String(length=10), nullable=True, server_default='ok'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('audit_logs')
    op.drop_table('planned_works')
    op.drop_table('sla_service_links')
    op.drop_table('services')
    op.drop_table('slas')
    op.drop_table('users')
