-- +goose Up
-- +goose StatementBegin

-- Fix background color (was incorrectly set to #303030, same as navBackground)
-- and remove unused palette keys: primaryDark, buttonPrimary, buttonSecondary
UPDATE app_settings
SET value = (value
    - 'primaryDark'
    - 'buttonPrimary'
    - 'buttonSecondary')
    || CASE
        WHEN value->>'background' = '#303030'
        THEN '{"background": "#f4f4f4"}'::jsonb
        ELSE '{}'::jsonb
    END
WHERE key = 'color_palette';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Re-add removed keys with defaults
UPDATE app_settings
SET value = value
    || '{"primaryDark": "#c4551f", "buttonPrimary": "#e26729", "buttonSecondary": "#818181"}'::jsonb
WHERE key = 'color_palette';

-- +goose StatementEnd
