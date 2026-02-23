-- name: GetSMTPConfig :one
SELECT * FROM smtp_config LIMIT 1;

-- name: UpsertSMTPConfig :one
INSERT INTO smtp_config (id, host, port, username, password, from_address, from_name, use_tls)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, $1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (id) DO UPDATE SET
    host = EXCLUDED.host,
    port = EXCLUDED.port,
    username = EXCLUDED.username,
    password = EXCLUDED.password,
    from_address = EXCLUDED.from_address,
    from_name = EXCLUDED.from_name,
    use_tls = EXCLUDED.use_tls,
    updated_at = NOW()
RETURNING *;
