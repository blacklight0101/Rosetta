using System.Collections.Generic;

namespace ShopWeb.Services
{
    public class CatalogItem
    {
        public int Id { get; set; }
        public string Name { get; set; }
        public decimal Price { get; set; }
    }

    public class CatalogService
    {
        public IList<CatalogItem> Find(string term) { return new List<CatalogItem>(); }

        public CatalogItem Get(int id) { return new CatalogItem { Id = id }; }
    }
}
