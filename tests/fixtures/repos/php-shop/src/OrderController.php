<?php
class OrderController
{
    public function show(int $id): string
    {
        $sql = "SELECT id, total FROM orders WHERE id = " . $id;
        $log = 'DELETE FROM sessions WHERE expires < NOW()';
        return $sql . $log;
    }
}
