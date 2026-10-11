<?php
function money(float $value): string
{
    return number_format($value, 2);
}
