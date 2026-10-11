<?php
require __DIR__ . '/src/OrderController.php';

$controller = new OrderController();
echo $controller->show((int) ($_GET['id'] ?? 0));
