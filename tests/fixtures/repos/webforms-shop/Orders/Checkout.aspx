<%@ Page Language="C#" CodeBehind="Checkout.aspx.cs" Inherits="ShopWeb.Orders.Checkout" %>
<html>
<body>
  <form runat="server">
    <asp:TextBox ID="EmailBox" runat="server" />
    <asp:RequiredFieldValidator ControlToValidate="EmailBox" runat="server" ErrorMessage="E-mail is required." />
    <asp:RegularExpressionValidator ControlToValidate="EmailBox" ValidationExpression="^[^@]+@[^@]+$" runat="server" ErrorMessage="Enter a valid e-mail." />
    <asp:DropDownList ID="ShippingList" runat="server" />
    <asp:Button ID="PlaceButton" Text="Place order" runat="server" OnClick="PlaceButton_Click" />
  </form>
</body>
</html>
