-- +goose Up
CREATE TABLE event_pinned_users (
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, user_id)
);

-- +goose Down
DROP TABLE IF EXISTS event_pinned_users;
