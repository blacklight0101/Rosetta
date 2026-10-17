using System.Collections.Generic;

namespace ShopWeb.Services
{
    public class OrderService
    {
        public object AddToBasket(object basket, int itemId, int quantity)
        {
            var lines = basket as List<int[]> ?? new List<int[]>();
            lines.Add(new[] { itemId, quantity });
            return lines;
        }

        public int Place(string email, string shipping, object basket)
        {
            var shippingFee = shipping == "express" ? 12 : 4;
            return 1000 + shippingFee;
        }
    }
}
