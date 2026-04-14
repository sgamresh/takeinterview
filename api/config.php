<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

function respond(int $status, array $payload): void {
  http_response_code($status);
  echo json_encode($payload, JSON_UNESCAPED_SLASHES);
  exit;
}

function is_local_request(): bool {
  $remote = $_SERVER['REMOTE_ADDR'] ?? '';
  return in_array($remote, ['127.0.0.1', '::1'], true);
}

if (!is_local_request()) {
  respond(403, ['ok' => false, 'error' => 'Forbidden: localhost only']);
}

$baseDir = realpath(__DIR__ . '/../data');
if ($baseDir === false) {
  respond(500, ['ok' => false, 'error' => 'Data directory not found']);
}

$files = [
  'modules' => $baseDir . DIRECTORY_SEPARATOR . 'modules.json',
  'roles' => $baseDir . DIRECTORY_SEPARATOR . 'roles.json',
  'templates' => $baseDir . DIRECTORY_SEPARATOR . 'templates.json'
];

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
  $output = [];
  foreach ($files as $key => $path) {
    if (!is_file($path)) {
      respond(500, ['ok' => false, 'error' => "Missing file: {$key}.json"]);
    }
    $raw = file_get_contents($path);
    if ($raw === false) {
      respond(500, ['ok' => false, 'error' => "Unable to read {$key}.json"]);
    }
    $parsed = json_decode($raw, true);
    if (!is_array($parsed)) {
      respond(500, ['ok' => false, 'error' => "Invalid JSON in {$key}.json"]);
    }
    $output[$key] = $parsed;
  }
  respond(200, $output);
}

if ($method === 'POST') {
  $raw = file_get_contents('php://input');
  if ($raw === false) {
    respond(400, ['ok' => false, 'error' => 'Invalid request body']);
  }
  $payload = json_decode($raw, true);
  if (!is_array($payload)) {
    respond(400, ['ok' => false, 'error' => 'Body must be valid JSON object']);
  }

  foreach (['modules', 'roles', 'templates'] as $key) {
    if (!array_key_exists($key, $payload) || !is_array($payload[$key])) {
      respond(400, ['ok' => false, 'error' => "Missing or invalid array: {$key}"]);
    }
  }

  foreach ($files as $key => $path) {
    $encoded = json_encode($payload[$key], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
      respond(500, ['ok' => false, 'error' => "Failed to encode {$key}"]);
    }
    $encoded .= PHP_EOL;
    $result = file_put_contents($path, $encoded, LOCK_EX);
    if ($result === false) {
      respond(500, ['ok' => false, 'error' => "Failed to write {$key}.json"]);
    }
  }

  respond(200, ['ok' => true, 'message' => 'JSON files updated']);
}

respond(405, ['ok' => false, 'error' => 'Method not allowed']);
