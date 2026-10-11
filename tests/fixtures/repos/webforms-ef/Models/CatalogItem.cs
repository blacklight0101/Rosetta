using System;

namespace ShopWeb.Models
{
    public interface IPriced
    {
        decimal Price { get; }
    }

    public class CatalogItem : IPriced
    {
        public int Id { get; set; }

        public string Name { get; set; }

        public decimal Price { get; set; }

        public string Label()
        {
            return Name + " (" + Price + ")";
        }
    }

    public class CatalogBrand
    {
        public int Id { get; set; }
    }
}
