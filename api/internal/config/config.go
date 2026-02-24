package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	Redis    RedisConfig
	Auth     AuthConfig
	App      AppConfig
}

type ServerConfig struct {
	ListenAddr   string // TCP address (host:port) from HTTP_LISTEN
	SocketPath   string // Unix socket path (overrides ListenAddr when set)
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	IdleTimeout  time.Duration
}

type DatabaseConfig struct {
	Host      string
	Port      int
	User      string
	Password  string
	Name      string
	SSLMode   string
	MaxConns  int32
	MinConns  int32
	SocketDir string // Unix socket directory (e.g. /var/run/postgresql)
}

func (c DatabaseConfig) DSN() string {
	if c.SocketDir != "" {
		return fmt.Sprintf(
			"host=%s user=%s password=%s dbname=%s sslmode=%s",
			c.SocketDir, c.User, c.Password, c.Name, c.SSLMode,
		)
	}
	return fmt.Sprintf(
		"postgres://%s:%s@%s:%d/%s?sslmode=%s",
		c.User, c.Password, c.Host, c.Port, c.Name, c.SSLMode,
	)
}

type RedisConfig struct {
	Host       string
	Port       int
	Password   string
	DB         int
	SocketPath string // Unix socket path (e.g. /var/run/redis/redis.sock)
}

func (c RedisConfig) Addr() string {
	if c.SocketPath != "" {
		return c.SocketPath
	}
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

func (c RedisConfig) Network() string {
	if c.SocketPath != "" {
		return "unix"
	}
	return "tcp"
}

type AuthConfig struct {
	SessionTTL   time.Duration
	CookieName   string
	CookieSecure bool
	CookieDomain string
	BcryptCost   int
}

type AppConfig struct {
	Environment        string
	BaseURL            string
	CORSAllowedOrigins []string
}

func Load() (*Config, error) {
	cfg := &Config{
		Server: ServerConfig{
			ListenAddr:   getEnv("API_LISTEN", "0.0.0.0:3000"),
			SocketPath:   getEnv("SERVER_SOCKET", ""),
			ReadTimeout:  getEnvDuration("SERVER_READ_TIMEOUT", 15*time.Second),
			WriteTimeout: getEnvDuration("SERVER_WRITE_TIMEOUT", 15*time.Second),
			IdleTimeout:  getEnvDuration("SERVER_IDLE_TIMEOUT", 60*time.Second),
		},
		Database: DatabaseConfig{
			Host:      getEnv("DB_HOST", "localhost"),
			Port:      getEnvInt("DB_PORT", 5432),
			User:      getEnv("DB_USER", "rncasp"),
			Password:  getEnv("DB_PASSWORD", "rncasp"),
			Name:      getEnv("DB_NAME", "rncasp"),
			SSLMode:   getEnv("DB_SSLMODE", "disable"),
			MaxConns:  int32(getEnvInt("DB_MAX_CONNS", 25)),
			MinConns:  int32(getEnvInt("DB_MIN_CONNS", 5)),
			SocketDir: getEnv("DB_SOCKET_DIR", ""),
		},
		Redis: RedisConfig{
			Host:       getEnv("REDIS_HOST", "localhost"),
			Port:       getEnvInt("REDIS_PORT", 6379),
			Password:   getEnv("REDIS_PASSWORD", ""),
			DB:         getEnvInt("REDIS_DB", 0),
			SocketPath: getEnv("REDIS_SOCKET", ""),
		},
		Auth: AuthConfig{
			SessionTTL:   getEnvDuration("AUTH_SESSION_TTL", 24*time.Hour),
			CookieName:   getEnv("AUTH_COOKIE_NAME", "rncasp_session"),
			CookieSecure: getEnvBool("AUTH_COOKIE_SECURE", true),
			CookieDomain: getEnv("AUTH_COOKIE_DOMAIN", ""),
			BcryptCost:   getEnvInt("AUTH_BCRYPT_COST", 12),
		},
		App: AppConfig{
			Environment:        getEnv("APP_ENV", "production"),
			BaseURL:            getEnv("APP_BASE_URL", "http://localhost:8080"),
			CORSAllowedOrigins: getEnvSlice("CORS_ALLOWED_ORIGINS", []string{"http://localhost:5173"}),
		},
	}

	return cfg, nil
}

func (c *Config) IsDev() bool {
	return c.App.Environment == "development"
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}

func getEnvDuration(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}

func getEnvSlice(key string, fallback []string) []string {
	if v := os.Getenv(key); v != "" {
		var result []string
		for _, s := range splitAndTrim(v) {
			if s != "" {
				result = append(result, s)
			}
		}
		if len(result) > 0 {
			return result
		}
	}
	return fallback
}

func splitAndTrim(s string) []string {
	var result []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == ',' {
			trimmed := trimSpace(s[start:i])
			result = append(result, trimmed)
			start = i + 1
		}
	}
	trimmed := trimSpace(s[start:])
	result = append(result, trimmed)
	return result
}

func trimSpace(s string) string {
	start, end := 0, len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t') {
		end--
	}
	return s[start:end]
}
