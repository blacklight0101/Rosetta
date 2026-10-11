using System.Data.Entity;

namespace ShopWeb.Models
{
    public class CatalogDBContext : DbContext
    {
        public CatalogDBContext() : base("name=CatalogDB")
        {
        }

        public DbSet<CatalogItem> CatalogItems { get; set; }

        public virtual IDbSet<CatalogBrand> CatalogBrands { get; set; }

        public string LastQuery { get; set; }
    }
}
