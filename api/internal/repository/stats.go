package repository

import "context"

const countEvents = `SELECT COUNT(*) FROM events`

func (q *Queries) CountEvents(ctx context.Context) (int64, error) {
	row := q.db.QueryRow(ctx, countEvents)
	var count int64
	err := row.Scan(&count)
	return count, err
}

const countActiveEvents = `SELECT COUNT(*) FROM events WHERE end_time > NOW()`

func (q *Queries) CountActiveEvents(ctx context.Context) (int64, error) {
	row := q.db.QueryRow(ctx, countActiveEvents)
	var count int64
	err := row.Scan(&count)
	return count, err
}

const countShifts = `SELECT COUNT(*) FROM shifts`

func (q *Queries) CountShifts(ctx context.Context) (int64, error) {
	row := q.db.QueryRow(ctx, countShifts)
	var count int64
	err := row.Scan(&count)
	return count, err
}

const countTeams = `SELECT COUNT(*) FROM teams`

func (q *Queries) CountTeams(ctx context.Context) (int64, error) {
	row := q.db.QueryRow(ctx, countTeams)
	var count int64
	err := row.Scan(&count)
	return count, err
}

const countSessions = `SELECT COUNT(*) FROM sessions`

func (q *Queries) CountSessions(ctx context.Context) (int64, error) {
	row := q.db.QueryRow(ctx, countSessions)
	var count int64
	err := row.Scan(&count)
	return count, err
}

const countExpiredSessions = `SELECT COUNT(*) FROM sessions WHERE expires_at <= NOW()`

func (q *Queries) CountExpiredSessions(ctx context.Context) (int64, error) {
	row := q.db.QueryRow(ctx, countExpiredSessions)
	var count int64
	err := row.Scan(&count)
	return count, err
}

const countAuditLogEntries = `SELECT COUNT(*) FROM audit_log`

func (q *Queries) CountAuditLogEntries(ctx context.Context) (int64, error) {
	row := q.db.QueryRow(ctx, countAuditLogEntries)
	var count int64
	err := row.Scan(&count)
	return count, err
}

const countNotifications = `SELECT COUNT(*) FROM notifications`

func (q *Queries) CountNotifications(ctx context.Context) (int64, error) {
	row := q.db.QueryRow(ctx, countNotifications)
	var count int64
	err := row.Scan(&count)
	return count, err
}

const countReadNotifications = `SELECT COUNT(*) FROM notifications WHERE is_read = true`

func (q *Queries) CountReadNotifications(ctx context.Context) (int64, error) {
	row := q.db.QueryRow(ctx, countReadNotifications)
	var count int64
	err := row.Scan(&count)
	return count, err
}
