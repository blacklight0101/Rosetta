using System.Web.Http;

namespace ShopWeb.Controllers
{
    public class CatalogController : ApiController
    {
        public string Get(int id)
        {
            return "item " + id;
        }
    }
}
