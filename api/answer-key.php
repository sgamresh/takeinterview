<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$remote = $_SERVER['REMOTE_ADDR'] ?? '';
if (!in_array($remote, ['127.0.0.1', '::1'], true)) {
  http_response_code(403);
  echo json_encode(['error' => 'Forbidden: localhost only']);
  exit;
}

$path = __DIR__ . '/../data/answer-key.local.json';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
  if (!is_file($path)) {
    http_response_code(404);
    echo json_encode(['error' => 'Local interviewer answer guide is missing']);
    exit;
  }

  $raw = file_get_contents($path);
  if ($raw === false || !is_array(json_decode($raw, true))) {
    http_response_code(500);
    echo json_encode(['error' => 'Unable to read valid local interviewer answer guide']);
    exit;
  }

  echo $raw;
  exit;
}

if ($method === 'POST') {
  $raw = file_get_contents('php://input');
  $payload = $raw === false ? null : json_decode($raw, true);
  $answerGuides = is_array($payload) ? ($payload['answerGuides'] ?? null) : null;
  if (!is_array($answerGuides)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Body must contain an answerGuides object']);
    exit;
  }

  foreach ($answerGuides as $moduleId => $guides) {
    if ((!is_string($moduleId) && !is_int($moduleId)) || !is_array($guides) || count($guides) !== 5 || array_keys($guides) !== range(0, 4)) {
      http_response_code(400);
      echo json_encode(['ok' => false, 'error' => 'Each module answer key must contain exactly five guidance strings']);
      exit;
    }
    foreach ($guides as $guide) {
      if (!is_string($guide)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Answer key guidance entries must be strings']);
        exit;
      }
    }
  }

  $encoded = json_encode((object) $answerGuides, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
  if ($encoded === false || file_put_contents($path, $encoded . PHP_EOL, LOCK_EX) === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Unable to save local interviewer answer guide']);
    exit;
  }

  echo json_encode(['ok' => true, 'message' => 'Local interviewer answer guide updated']);
  exit;
}

http_response_code(405);
header('Allow: GET, POST');
echo json_encode(['error' => 'Method not allowed']);
