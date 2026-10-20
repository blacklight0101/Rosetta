namespace Pricing.Tools
{
    public static class Helper
    {
        public static string Label(string customerType)
        {
            return customerType.Trim().ToUpperInvariant();
        }
    }
}
