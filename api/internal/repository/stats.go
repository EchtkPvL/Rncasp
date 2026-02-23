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
